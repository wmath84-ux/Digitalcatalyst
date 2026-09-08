// Small, spatially coherent repetitions that were NOT already merged:
// the fan's three identical blades. Instance matrices upload once. The fan still animates its parent group normally.
// Do not use this for scattered furniture / individually animated students:
// one giant instance bound would undo their useful per-object culling.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Euler, Matrix4, type InstancedMesh } from "three";

export interface StaticPose {
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
}

export default function StaticInstances({ poses, children }: { poses: readonly StaticPose[]; children: ReactNode }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = mesh.current;
    if (!object) return;
    const matrix = new Matrix4();
    const rotation = new Euler();
    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i];
      if (pose.rotation) rotation.set(...pose.rotation);
      else rotation.set(0, 0, 0);
      matrix.makeRotationFromEuler(rotation);
      matrix.setPosition(...pose.position);
      object.setMatrixAt(i, matrix);
    }
    object.instanceMatrix.needsUpdate = true;
    // Three's normal instance frustum culling needs bounds that include ALL
    // placements, not just the base cylinder/box at the origin.
    object.computeBoundingBox();
    object.computeBoundingSphere();
  }, [poses]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, poses.length]} matrixAutoUpdate={false}>
      {children}
    </instancedMesh>
  );
}
