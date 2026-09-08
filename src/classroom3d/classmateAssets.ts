// Bounded, lazily-created asset pool, like mergedStatics. The seven students
// used to allocate 49 geometries + 49 materials. They keep their individual
// animated meshes and frustum bounds; only identical resources are shared.
// These procedural buffers have no downloads, texture decode or UV assets.
import { CapsuleGeometry, MeshStandardMaterial, Sphere, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from "three";

export const CLASSMATES = [
  { position: [-3.1, 0, 2.85], hue: "#4c6ef5", writing: true },
  { position: [3.3, 0, 2.85], hue: "#2f9e6e", writing: false },
  { position: [-3.1, 0, 5.35], hue: "#d97757", writing: false },
  { position: [0.15, 0, 5.35], hue: "#7c5cd6", writing: true },
  { position: [3.3, 0, 5.35], hue: "#b8455f", writing: true },
  { position: [-3.1, 0, 7.65], hue: "#3f7fb5", writing: false },
  { position: [3.3, 0, 7.65], hue: "#8a6b3d", writing: true },
] as const;

// Includes the COMPLETE breathing/writing sweep, not a bind-pose-only bound.
export const classmateBounds = (x: number, z: number): Sphere => new Sphere(new Vector3(x, 0.66, z + 0.08), 0.88);

// Mesh order: jacket, scarf, head, hat, writing arm, resting arm, legs.
export type ClassmateParts = readonly BufferGeometry[];

function createAssets() {
  const writingArm = new CapsuleGeometry(0.052, 0.34, 4, 8);
  const restingArm = new CapsuleGeometry(0.052, 0.3, 4, 8);
  const legs = new CapsuleGeometry(0.075, 0.34, 4, 8);
  const parts = (cap: number, torso: number, scarfRadial: number, scarfTubular: number, headWidth: number, headHeight: number, hatWidth: number, hatHeight: number): ClassmateParts => [
    new CapsuleGeometry(0.19, 0.34, cap, torso),
    new TorusGeometry(0.15, 0.045, scarfRadial, scarfTubular),
    new SphereGeometry(0.145, headWidth, headHeight),
    new SphereGeometry(0.152, hatWidth, hatHeight, 0, Math.PI * 2, 0, Math.PI * 0.62),
    // These already-cheap shapes are identical on EVERY tier.
    writingArm, restingArm, legs,
  ];
  const levels = [
    parts(4, 12, 8, 18, 20, 16, 18, 14), // Exact original near geometry.
    parts(3, 10, 6, 14, 14, 12, 14, 10),
    parts(2, 8, 5, 10, 10, 8, 10, 8),
  ] as const;
  const materials = {
    jackets: CLASSMATES.map(mate => new MeshStandardMaterial({ color: mate.hue, roughness: 0.85 })),
    scarf: new MeshStandardMaterial({ color: "#e2506a", roughness: 0.9 }),
    head: new MeshStandardMaterial({ color: "#c89272", roughness: 0.75 }),
    hat: new MeshStandardMaterial({ color: "#2a2333", roughness: 0.95 }),
    legs: new MeshStandardMaterial({ color: "#2f3646", roughness: 0.9 }),
  };
  // CPU bounds are computed once, not in Three's first visible draw.
  for (const geometry of new Set(levels.flat())) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return { levels, materials };
}

let cache: ReturnType<typeof createAssets> | undefined;
/** Intentional, fixed-size app-lifetime cache; never grows with room visits. */
export const getClassmateAssets = () => (cache ??= createAssets());
