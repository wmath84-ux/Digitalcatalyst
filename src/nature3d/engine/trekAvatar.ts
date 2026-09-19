// src/nature3d/engine/trekAvatar.ts
//
// THE WALKING CHARACTER — TerrainTrek's player, implemented exactly.
//
// Source: github.com/MITHRAN-BALACHANDER/-TerrainTrek-
//   sources/Game/View/Player.js          (the stick-human body)
//   sources/Game/State/Player.js         (movement + rotation model)
//   sources/Game/State/CameraThirdPerson.js (the orbit camera behind them)
//
// Every published constant is carried over unchanged and marked below, so
// this reads and steers like the original rather than merely resembling it:
//
//   body      head r=0.24 @ y=1.62, neck 0.09/0.15 @ 1.38, torso 0.22/0.75
//             @ 1.0, arms 0.09/0.6 at shoulder (±0.34, 1.45) tilted ±0.2,
//             legs 0.12/0.85 at x=±0.18, y=0.5
//   movement  walk 10 u/s, boost 30 u/s
//   rotation  8-way: the heading is the camera's theta, then offset by
//             ±PI/4 (diagonals), ±PI/2 (pure strafe) or PI (backwards)
//   camera    distance 15, phi PI*0.45, theta -PI*0.25, aboveOffset 2,
//             phi clamped to [0.1, PI-0.1]
//
// The one addition is sitting: the same body, posed on the study chair.

import * as THREE from "three";
import { terrainHeight } from "./terrain";
import type { VirtualStick } from "./controls";

/** TerrainTrek's movement speeds, verbatim. */
export const WALK_SPEED = 10;
export const BOOST_SPEED = 30;

/** TerrainTrek's third-person camera constants, verbatim. */
export const CAM_DISTANCE = 15;
export const CAM_PHI = Math.PI * 0.45;
export const CAM_THETA = -Math.PI * 0.25;
export const CAM_ABOVE_OFFSET = 2;
export const PHI_MIN = 0.1;
export const PHI_MAX = Math.PI - 0.1;

export interface TrekAvatar {
  group: THREE.Group;
  /** Hide the body (first person) without disturbing the rig. */
  setVisible(v: boolean): void;
  /** Seat the avatar on the chair, or stand them back up. */
  setSeated(seated: boolean, chair?: THREE.Vector3): void;
  readonly seated: boolean;
  dispose(): void;
}

/**
 * Build TerrainTrek's stick human.
 *
 * The original uses a custom PlayerMaterial (a shader that shades by a sun
 * uniform). Here the parts take a standard lit material instead, so the
 * character receives the Sanctuary's real sunlight and casts real shadows
 * like everything else in this world. The GEOMETRY — which is what you
 * actually recognise — is identical.
 */
export function createTrekAvatar(shadows: boolean): TrekAvatar {
  const group = new THREE.Group();
  group.name = "trek-avatar";

  const body = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0xc08bf0 }); // 'violet'

  const parts: THREE.Object3D[] = [];

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), material);
  head.position.y = 1.62;
  parts.push(head);

  // Neck
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.15, 6, 12), material);
  neck.position.y = 1.38;
  parts.push(neck);

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 6, 18), material);
  torso.position.y = 1.0;
  parts.push(torso);

  // Arms, on shoulder pivots so they can be posed when seated.
  const armGeom = new THREE.CapsuleGeometry(0.09, 0.6, 6, 12);
  const shoulderY = 1.45;
  const shoulderX = 0.34;
  const armOffsetDown = -(0.6 * 0.5 - 0.4);
  const armL = new THREE.Group();
  armL.position.set(-shoulderX, shoulderY, 0);
  const armLMesh = new THREE.Mesh(armGeom, material);
  armLMesh.position.y = armOffsetDown;
  armL.add(armLMesh);
  armL.rotation.z = 0.2;
  parts.push(armL);

  const armR = new THREE.Group();
  armR.position.set(shoulderX, shoulderY, 0);
  const armRMesh = new THREE.Mesh(armGeom, material);
  armRMesh.position.y = armOffsetDown;
  armR.add(armRMesh);
  armR.rotation.z = -0.2;
  parts.push(armR);

  // Legs, also on hip pivots so they can fold at the knee when sitting.
  const legGeom = new THREE.CapsuleGeometry(0.12, 0.85, 6, 14);
  const legL = new THREE.Group();
  legL.position.set(-0.18, 0.93, 0);
  const legLMesh = new THREE.Mesh(legGeom, material);
  legLMesh.position.y = -0.43;
  legL.add(legLMesh);
  parts.push(legL);

  const legR = new THREE.Group();
  legR.position.set(0.18, 0.93, 0);
  const legRMesh = new THREE.Mesh(legGeom, material);
  legRMesh.position.y = -0.43;
  legR.add(legRMesh);
  parts.push(legR);

  for (const p of parts) {
    p.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = shadows;
        m.receiveShadow = shadows;
      }
    });
    body.add(p);
  }
  group.add(body);

  let seated = false;

  return {
    group,
    setVisible(v) {
      body.visible = v;
    },
    setSeated(v, chair) {
      seated = v;
      if (v) {
        // Sitting: hips drop to seat height, thighs go horizontal, shins
        // hang down, arms come forward to rest on the desk line.
        legL.rotation.x = -Math.PI / 2;
        legR.rotation.x = -Math.PI / 2;
        legL.position.set(-0.18, 0.5, 0);
        legR.position.set(0.18, 0.5, 0);
        armL.rotation.set(-0.85, 0, 0.12);
        armR.rotation.set(-0.85, 0, -0.12);
        body.position.y = -0.42;
        if (chair) {
          group.position.copy(chair);
          // Face the board, which is on the -Z side of the clearing.
          group.rotation.y = Math.PI;
        }
      } else {
        legL.rotation.x = 0;
        legR.rotation.x = 0;
        legL.position.set(-0.18, 0.93, 0);
        legR.position.set(0.18, 0.93, 0);
        armL.rotation.set(0, 0, 0.2);
        armR.rotation.set(0, 0, -0.2);
        body.position.y = 0;
      }
    },
    get seated() {
      return seated;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      material.dispose();
      group.clear();
    },
  };
}

/**
 * TerrainTrek's player state + third-person camera.
 *
 * The movement model is the distinctive part and is reproduced exactly: the
 * character does not steer like a tank. Instead the camera's theta IS the
 * heading, and the pressed direction applies a fixed offset to it, so the
 * avatar always runs in the direction you are looking and snaps to one of
 * eight compass points relative to the camera.
 */
export class TrekPlayer {
  position = new THREE.Vector3(0, 0, 0);
  rotation = 0;
  speed = 0;

  // Camera orbit state — TerrainTrek's starting values.
  distance = CAM_DISTANCE;
  phi = CAM_PHI;
  theta = CAM_THETA;

  boost = false;

  private previous = new THREE.Vector3();
  private sphere = new THREE.Vector3();
  private target = new THREE.Vector3();

  reset(x: number, z: number) {
    this.position.set(x, terrainHeight(x, z), z);
    this.previous.copy(this.position);
    this.phi = CAM_PHI;
    this.theta = CAM_THETA;
    this.distance = CAM_DISTANCE;
  }

  /** Drag/swipe look. TerrainTrek scales the normalised delta by 2. */
  look(dx: number, dy: number) {
    this.phi -= dy * 2;
    this.theta -= dx * 2;
    if (this.phi < PHI_MIN) this.phi = PHI_MIN;
    if (this.phi > PHI_MAX) this.phi = PHI_MAX;
  }

  zoom(factor: number) {
    this.distance = THREE.MathUtils.clamp(this.distance * factor, 3, 90);
  }

  /**
   * Advance the player and place the camera.
   *
   * `stick` carries the joystick / WASD vector. It is converted to the
   * original's four booleans first, so the eight-way rotation table below is
   * literally TerrainTrek's, not a reinterpretation of it.
   */
  update(dt: number, stick: VirtualStick, camera: THREE.PerspectiveCamera, limit: number) {
    const DEAD = 0.25; // TerrainTrek's joystick threshold
    const forward = stick.active && stick.y > DEAD;
    const backward = stick.active && stick.y < -DEAD;
    const strafeLeft = stick.active && stick.x < -DEAD;
    const strafeRight = stick.active && stick.x > DEAD;

    if (forward || backward || strafeLeft || strafeRight) {
      // The camera's theta is the heading; the pressed keys offset it.
      this.rotation = this.theta;

      if (forward) {
        if (strafeLeft) this.rotation += Math.PI * 0.25;
        else if (strafeRight) this.rotation -= Math.PI * 0.25;
      } else if (backward) {
        if (strafeLeft) this.rotation += Math.PI * 0.75;
        else if (strafeRight) this.rotation -= Math.PI * 0.75;
        else this.rotation -= Math.PI;
      } else if (strafeLeft) {
        this.rotation += Math.PI * 0.5;
      } else if (strafeRight) {
        this.rotation -= Math.PI * 0.5;
      }

      const speed = this.boost ? BOOST_SPEED : WALK_SPEED;
      const x = Math.sin(this.rotation) * dt * speed;
      const z = Math.cos(this.rotation) * dt * speed;

      const nx = this.position.x - x;
      const nz = this.position.z - z;
      // Keep the walker inside the connected world.
      if (Math.hypot(nx, this.position.z) < limit) this.position.x = nx;
      if (Math.hypot(this.position.x, nz) < limit) this.position.z = nz;
    }

    this.speed = this.position.distanceTo(this.previous);
    this.previous.copy(this.position);

    // Stand on the ground — the same height field everything else samples.
    this.position.y = terrainHeight(this.position.x, this.position.z);

    // ── Third-person camera, TerrainTrek's spherical placement ──
    const sinPhiRadius = Math.sin(this.phi) * this.distance;
    this.sphere.set(
      sinPhiRadius * Math.sin(this.theta),
      Math.cos(this.phi) * this.distance,
      sinPhiRadius * Math.cos(this.theta),
    );
    camera.position.copy(this.position).add(this.sphere);
    this.target.set(this.position.x, this.position.y + CAM_ABOVE_OFFSET, this.position.z);
    camera.lookAt(this.target);

    // Never let the camera end up underground on a steep slope.
    const floor = terrainHeight(camera.position.x, camera.position.z) + 1.2;
    if (camera.position.y < floor) camera.position.y = floor;
  }
}
