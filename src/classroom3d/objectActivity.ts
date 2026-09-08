// Lightweight animation visibility, NOT a second renderer/culling engine.
// Ordinary mesh frustum culling stays enabled. Animated groups need an
// additional bound because Three culls draws, not their useFrame callbacks.
import { Frustum, Matrix4, type Camera, type Object3D, type Sphere } from "three";

const views = new WeakMap<Camera, { stamp: number; frustum: Frustum; matrix: Matrix4 }>();

/** One projection × view calculation per camera/frame, shared by all props. */
export function frameFrustum(camera: Camera, stamp: number): Frustum {
  let view = views.get(camera);
  if (!view) {
    view = { stamp: NaN, frustum: new Frustum(), matrix: new Matrix4() };
    views.set(camera, view);
  }
  if (stamp !== view.stamp) {
    view.stamp = stamp;
    view.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    view.frustum.setFromProjectionMatrix(view.matrix, camera.coordinateSystem);
  }
  return view.frustum;
}

/** Geometry LOD only for classmates' curved parts; boxes never get LOD. */
export type ClassmateLod = 0 | 1 | 2;
const LOD_DISTANCES: readonly number[] = [5, 9];
const LOD_HYSTERESIS = 0.6;

export function classmateLod(distanceSquared: number, previous: ClassmateLod): ClassmateLod {
  let level = previous;
  while (level < 2 && distanceSquared > (LOD_DISTANCES[level] + LOD_HYSTERESIS) ** 2) {
    level = (level + 1) as ClassmateLod;
  }
  while (level > 0 && distanceSquared < (LOD_DISTANCES[level - 1] - LOD_HYSTERESIS) ** 2) {
    level = (level - 1) as ClassmateLod;
  }
  return level;
}

/** Near motion stays full-rate; far sub-pixel detail can tick less often. */
export const animationInterval = (distanceSquared: number): number =>
  distanceSquared <= 25 ? 0 : distanceSquared <= 100 ? 1 / 30 : 1 / 15;

export class ObjectActivity {
  visible = true;
  private lastUpdate = -Infinity;

  /** No raycasts, scene walks, allocations, React state or catch-up loops. */
  shouldUpdate(camera: Camera, time: number, bounds: Sphere, force = false): boolean {
    const visible = force || frameFrustum(camera, time).intersectsSphere(bounds);
    if (!visible) {
      this.visible = false;
      return false;
    }
    const wake = !this.visible;
    this.visible = true;
    const interval = force ? 0 : animationInterval(camera.position.distanceToSquared(bounds.center));
    if (!wake && time >= this.lastUpdate && time - this.lastUpdate + 1e-6 < interval) return false;
    this.lastUpdate = time;
    return true;
  }
}

/**
 * One mount/tier-edge traversal, never a per-frame traversal. Local matrices
 * of static objects do not need recomposition. World matrices remain normal
 * Three-managed matrices (including children of animated parents).
 */
export function freezeStaticLocalMatrices(root: Object3D): void {
  root.traverse((object) => {
    if (object.userData.classroomAnimated) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
}
