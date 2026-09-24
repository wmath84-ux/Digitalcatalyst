// src/nature3d/engine/character/CharacterDebug.ts
//
// Development-only telemetry for the locomotion system: state, speed,
// grounded, slope, vertical velocity, animation label, fps, draw calls.
// The engine fills ONE reused object (no per-frame allocation) and the page
// paints it into a DOM node with direct writes — React never re-renders.
//
// Debug VISUALS (capsule wireframe, ground ray, foot-plant markers) live here
// too, behind an explicit enable flag that production never sets.

import * as THREE from "three";
import type { LocomotionSnapshot } from "./MovementState";
import { CHARACTER_TUNING as T } from "./CharacterConfig";

export interface CharacterDebugSnapshot {
  locomotion: string;
  stance: string;
  airborne: string;
  speed: number;
  grounded: boolean;
  slopeDeg: number;
  verticalVel: number;
  yawDeg: number;
  gaitPhase: number;
  sprint: number;
  crouch: number;
  prone: number;
  fps: number;
  draws: number;
}

export function createDebugSnapshot(): CharacterDebugSnapshot {
  return {
    locomotion: "idle",
    stance: "stand",
    airborne: "ground",
    speed: 0,
    grounded: true,
    slopeDeg: 0,
    verticalVel: 0,
    yawDeg: 0,
    gaitPhase: 0,
    sprint: 0,
    crouch: 0,
    prone: 0,
    fps: 0,
    draws: 0,
  };
}

const RAD2DEG = 180 / Math.PI;

export function fillDebugSnapshot(
  out: CharacterDebugSnapshot,
  snap: LocomotionSnapshot,
  fps: number,
  draws: number,
): void {
  out.locomotion = snap.locomotion;
  out.stance = snap.stance;
  out.airborne = snap.airborne;
  out.speed = snap.speed;
  out.grounded = snap.grounded;
  out.slopeDeg = snap.slopeAngle * RAD2DEG;
  out.verticalVel = snap.verticalVel;
  out.yawDeg = snap.yaw * RAD2DEG;
  out.gaitPhase = snap.gaitPhase;
  out.sprint = snap.sprint01;
  out.crouch = snap.crouch01;
  out.prone = snap.prone01;
  out.fps = fps;
  out.draws = draws;
}

/** One-line text for the debug overlay. Reuses a module buffer. */
export function formatDebugLine(d: CharacterDebugSnapshot): string {
  return (
    `${d.locomotion} · ${d.stance} · ${d.airborne} · ` +
    `${d.speed.toFixed(1)}m/s · ${d.grounded ? "ground" : "AIR"} · ` +
    `slope ${d.slopeDeg.toFixed(0)}° · vy ${d.verticalVel.toFixed(1)} · ` +
    `${Math.round(d.fps)}fps ${d.draws}dr`
  );
}

/**
 * Debug visuals group: capsule wireframe + ground-normal arrow + foot rays.
 * Created once, updated in place, added to the scene only when enabled.
 */
export class CharacterDebugVisuals {
  readonly group = new THREE.Group();
  private capsule: THREE.LineSegments;
  private normalArrow: THREE.ArrowHelper;
  private groundRay: THREE.Line;
  private readonly rayGeo = new THREE.BufferGeometry();

  constructor() {
    this.group.name = "character-debug";
    this.group.visible = false;
    const capsuleGeo = new THREE.CapsuleGeometry(T.capsuleRadius, T.standHeight - T.capsuleRadius * 2, 3, 8);
    this.capsule = new THREE.LineSegments(
      new THREE.WireframeGeometry(capsuleGeo),
      new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6, depthTest: false }),
    );
    this.capsule.renderOrder = 999;
    this.group.add(this.capsule);
    this.normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      1.2,
      0x33ccff,
      0.25,
      0.14,
    );
    (this.normalArrow.line.material as THREE.Material).depthTest = false;
    this.normalArrow.renderOrder = 999;
    this.group.add(this.normalArrow);
    this.rayGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.groundRay = new THREE.Line(
      this.rayGeo,
      new THREE.LineBasicMaterial({ color: 0xffcc33, depthTest: false, transparent: true, opacity: 0.8 }),
    );
    this.groundRay.renderOrder = 999;
    this.groundRay.frustumCulled = false;
    this.group.add(this.groundRay);
  }

  setEnabled(on: boolean): void {
    this.group.visible = on;
  }

  get enabled(): boolean {
    return this.group.visible;
  }

  /** Move the helpers to the character. All writes are in place. */
  update(feetPos: THREE.Vector3, groundY: number, normal: THREE.Vector3, stanceHeight: number): void {
    if (!this.group.visible) return;
    this.capsule.position.set(feetPos.x, feetPos.y + stanceHeight / 2, feetPos.z);
    const sy = stanceHeight / T.standHeight;
    this.capsule.scale.set(1, sy, 1);
    this.normalArrow.position.set(feetPos.x, groundY + 0.05, feetPos.z);
    this.normalArrow.setDirection(normal);
    const p = this.rayGeo.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, feetPos.x, feetPos.y + 1.6, feetPos.z);
    p.setXYZ(1, feetPos.x, groundY, feetPos.z);
    p.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.LineSegments;
      m.geometry?.dispose?.();
      const mat = (m as unknown as { material?: THREE.Material }).material;
      mat?.dispose?.();
    });
    this.group.clear();
  }
}
