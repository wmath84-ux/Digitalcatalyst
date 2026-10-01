import * as THREE from "three";
import { CHARACTER_HEIGHT, CHARACTER_SCALE, COVER_CROUCH_HEIGHT, COVER_LOW_HEIGHT } from "./characterConfig";

export interface ColliderBase {
  id: string;
  x: number;
  z: number;
  baseY: number;
  height: number;
  /** Only solid, reasonably sized obstacles opt into cover. */
  cover?: boolean;
}
export interface BoxCollider extends ColliderBase {
  kind: "box";
  halfX: number;
  halfZ: number;
  yaw: number;
}
export interface CircleCollider extends ColliderBase {
  kind: "circle";
  radius: number;
}
export type CharacterCollider = BoxCollider | CircleCollider;
interface IndexedCollider {
  source: CharacterCollider;
  cos: number;
  sin: number;
}
export interface CoverContact {
  collider: BoxCollider;
  normalX: number;
  normalZ: number;
  tangentX: number;
  tangentZ: number;
  anchorX: number;
  anchorZ: number;
  min: number;
  max: number;
  along: number;
  low: boolean;
}

const CELL = 24;
const EMPTY: readonly IndexedCollider[] = [];
const key = (x: number, z: number) => (x + 2048) * 4096 + z + 2048;

/**
 * A height-field + upright capsule collision world. Spatial buckets are built
 * only when an async prop arrives, never in the frame loop. The same obstacle
 * data is used for walking, step/ceiling tests, cover and the camera spring arm.
 * No triangle raycasts against millions of grass/leaf instances.
 */
export class CharacterCollisionWorld {
  private groups = new Map<string, readonly CharacterCollider[]>();
  private buckets = new Map<number, IndexedCollider[]>();
  private all: IndexedCollider[] = [];

  constructor(
    readonly terrainAt: (x: number, z: number) => number,
    readonly radius = 1100,
    readonly waterAt: (x: number, z: number) => number = () => -Infinity,
  ) {}

  setGroup(id: string, colliders: readonly CharacterCollider[]) {
    this.groups.set(id, colliders);
    this.rebuild();
  }

  removeGroup(id: string) {
    if (this.groups.delete(id)) this.rebuild();
  }

  private rebuild() {
    this.buckets.clear();
    this.all = [];
    for (const colliders of this.groups.values()) {
      for (const source of colliders) {
        if (!Number.isFinite(source.x + source.z + source.baseY + source.height) || source.height <= 0) continue;
        const yaw = source.kind === "box" ? source.yaw : 0;
        const item = { source, cos: Math.cos(yaw), sin: Math.sin(yaw) };
        this.all.push(item);
        const hx = source.kind === "box"
          ? Math.abs(item.cos) * source.halfX + Math.abs(item.sin) * source.halfZ : source.radius;
        const hz = source.kind === "box"
          ? Math.abs(item.sin) * source.halfX + Math.abs(item.cos) * source.halfZ : source.radius;
        // Extra 2 m covers capsule contacts, camera probes and nearby cover.
        for (let x = Math.floor((source.x - hx - 2) / CELL); x <= Math.floor((source.x + hx + 2) / CELL); x++) {
          for (let z = Math.floor((source.z - hz - 2) / CELL); z <= Math.floor((source.z + hz + 2) / CELL); z++) {
            const k = key(x, z);
            const bucket = this.buckets.get(k);
            if (bucket) bucket.push(item);
            else this.buckets.set(k, [item]);
          }
        }
      }
    }
  }

  private nearby(x: number, z: number): readonly IndexedCollider[] {
    return this.buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? EMPTY;
  }

  private inside(item: IndexedCollider, x: number, z: number, margin = 0): boolean {
    const c = item.source;
    const dx = x - c.x;
    const dz = z - c.z;
    if (c.kind === "circle") return dx * dx + dz * dz < (c.radius + margin) ** 2;
    const lx = dx * item.cos - dz * item.sin;
    const lz = dx * item.sin + dz * item.cos;
    const ex = Math.max(Math.abs(lx) - c.halfX, 0);
    const ez = Math.max(Math.abs(lz) - c.halfZ, 0);
    return ex * ex + ez * ez < margin * margin || (Math.abs(lx) <= c.halfX && Math.abs(lz) <= c.halfZ);
  }

  /** Top of a prop is a platform only when approached from above/a small step. */
  floorAt(x: number, z: number, previousFeetY: number, stepHeight: number, supportRadius = 0): number {
    let floor = this.terrainAt(x, z);
    for (const item of this.nearby(x, z)) {
      const c = item.source;
      const top = c.baseY + c.height;
      if (top <= previousFeetY + stepHeight + 1e-5 && top > floor && this.inside(item, x, z, supportRadius)) floor = top;
    }
    return floor;
  }

  canOccupy(x: number, y: number, z: number, radius: number, height: number): boolean {
    for (const item of this.nearby(x, z)) {
      const c = item.source;
      if (y < c.baseY + c.height - 0.015 && y + height > c.baseY + 0.015 && this.inside(item, x, z, radius)) return false;
    }
    return true;
  }

  /** Slide the capsule around walls; remove velocity INTO a contact, not along it. */
  resolve(position: THREE.Vector3, velocity: THREE.Vector3, radius: number, height: number) {
    for (let pass = 0; pass < 3; pass++) {
      let touched = false;
      for (const item of this.nearby(position.x, position.z)) {
        const c = item.source;
        if (position.y >= c.baseY + c.height - 0.015 || position.y + height <= c.baseY + 0.015) continue;
        const dx = position.x - c.x;
        const dz = position.z - c.z;
        let nx = 0;
        let nz = 0;
        let depth = 0;
        if (c.kind === "circle") {
          const dist = Math.hypot(dx, dz);
          depth = c.radius + radius - dist;
          if (depth <= 0) continue;
          nx = dist > 1e-6 ? dx / dist : 1;
          nz = dist > 1e-6 ? dz / dist : 0;
        } else {
          const lx = dx * item.cos - dz * item.sin;
          const lz = dx * item.sin + dz * item.cos;
          const ex = lx - THREE.MathUtils.clamp(lx, -c.halfX, c.halfX);
          const ez = lz - THREE.MathUtils.clamp(lz, -c.halfZ, c.halfZ);
          const dist = Math.hypot(ex, ez);
          let lnx: number;
          let lnz: number;
          if (dist > 1e-6) {
            depth = radius - dist;
            if (depth <= 0) continue;
            lnx = ex / dist;
            lnz = ez / dist;
          } else {
            // Centre inside the footprint: leave by the nearest face.
            const px = c.halfX + radius - Math.abs(lx);
            const pz = c.halfZ + radius - Math.abs(lz);
            if (px < pz) { depth = px; lnx = lx < 0 ? -1 : 1; lnz = 0; }
            else { depth = pz; lnx = 0; lnz = lz < 0 ? -1 : 1; }
          }
          nx = lnx * item.cos + lnz * item.sin;
          nz = -lnx * item.sin + lnz * item.cos;
        }
        position.x += nx * (depth + 1e-5);
        position.z += nz * (depth + 1e-5);
        const into = velocity.x * nx + velocity.z * nz;
        if (into < 0) { velocity.x -= nx * into; velocity.z -= nz * into; }
        touched = true;
      }
      if (!touched) break;
    }
    const reach = Math.hypot(position.x, position.z);
    if (reach > this.radius - radius) {
      const s = (this.radius - radius) / reach;
      position.x *= s;
      position.z *= s;
      const out = (velocity.x * position.x + velocity.z * position.z) / Math.max(reach, 1);
      if (out > 0) {
        velocity.x -= position.x / (this.radius - radius) * out;
        velocity.z -= position.z / (this.radius - radius) * out;
      }
    }
  }

  cameraBlocked(x: number, y: number, z: number, radius: number): boolean {
    if (y < Math.max(this.terrainAt(x, z), this.waterAt(x, z)) + radius) return true;
    for (const item of this.nearby(x, z)) {
      const c = item.source;
      if (y > c.baseY - radius && y < c.baseY + c.height + radius && this.inside(item, x, z, radius)) return true;
    }
    return false;
  }

  /** An authored box face is a straight cover path (same input semantics as UE). */
  findCover(position: THREE.Vector3, bodyRadius: number, reach = 1.6 * CHARACTER_SCALE): CoverContact | null {
    let result: CoverContact | null = null;
    let best = reach;
    for (const item of this.nearby(position.x, position.z)) {
      const c = item.source;
      if (c.kind !== "box" || !c.cover || c.height < 0.6 * CHARACTER_SCALE || position.y > c.baseY + 0.5 * CHARACTER_SCALE) continue;
      const dx = position.x - c.x;
      const dz = position.z - c.z;
      const lx = dx * item.cos - dz * item.sin;
      const lz = dx * item.sin + dz * item.cos;
      for (let face = 0; face < 4; face++) {
        const xFace = face < 2;
        const sign = face % 2 === 0 ? 1 : -1;
        const half = xFace ? c.halfX : c.halfZ;
        const alongHalf = xFace ? c.halfZ : c.halfX;
        if (alongHalf <= bodyRadius) continue;
        const along = THREE.MathUtils.clamp(xFace ? lz : lx, -alongHalf + bodyRadius, alongHalf - bodyRadius);
        const ax = xFace ? sign * (half + bodyRadius + 0.04 * CHARACTER_SCALE) : along;
        const az = xFace ? along : sign * (half + bodyRadius + 0.04 * CHARACTER_SCALE);
        const dist = Math.hypot(ax - lx, az - lz);
        if (dist >= best) continue;
        const normalX = xFace ? sign * item.cos : sign * item.sin;
        const normalZ = xFace ? -sign * item.sin : sign * item.cos;
        const tangentX = xFace ? item.sin : item.cos;
        const tangentZ = xFace ? item.cos : -item.sin;
        const anchorX = c.x + normalX * (half + bodyRadius + 0.04 * CHARACTER_SCALE);
        const anchorZ = c.z + normalZ * (half + bodyRadius + 0.04 * CHARACTER_SCALE);
        const coverHeight = c.height < COVER_LOW_HEIGHT ? COVER_CROUCH_HEIGHT : CHARACTER_HEIGHT;
        if (!this.canOccupy(anchorX + tangentX * along, position.y, anchorZ + tangentZ * along, bodyRadius, coverHeight)) continue;
        best = dist;
        result = { collider: c, normalX, normalZ, tangentX, tangentZ, anchorX, anchorZ,
          min: -alongHalf + bodyRadius, max: alongHalf - bodyRadius, along, low: c.height < COVER_LOW_HEIGHT };
      }
    }
    return result;
  }

  dispose() {
    this.groups.clear();
    this.buckets.clear();
    this.all = [];
  }
}
