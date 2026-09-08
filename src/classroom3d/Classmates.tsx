import { memo, useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { CLASSMATES, classmateBounds, getClassmateAssets } from "./classmateAssets";
import { retainSharedResources } from "./resourceLifetime";
import { ObjectActivity, classmateLod, type ClassmateLod } from "./objectActivity";

function Classmates() {
  const assets = getClassmateAssets();
  useLayoutEffect(() => retainSharedResources([
    ...assets.levels.flat(), ...Object.values(assets.materials).flat(),
  ]), [assets]);
  const entries = useMemo(() => CLASSMATES.map((mate, index) => ({
    ...mate, phase: index * 1.37,
    bounds: classmateBounds(mate.position[0], mate.position[2]),
    activity: new ObjectActivity(),
    level: 0 as ClassmateLod,
    root: null as Group | null, torso: null as Group | null, arm: null as Group | null,
    meshes: new Array<Mesh | null>(7).fill(null),
  })), []);

  // One animation subscriber for the population, not one per student. The
  // seated rig runs first (negative priority) so culling uses THIS frame's
  // camera, even during a fast drag. All mutations are allocation-free.
  useFrame(({ camera, clock, gl }) => {
    // The one-time shadow bake must include off-camera casters at full detail.
    const baking = gl.shadowMap.autoUpdate || gl.shadowMap.needsUpdate;
    const time = clock.elapsedTime;
    for (const entry of entries) {
      const update = entry.activity.shouldUpdate(camera, time, entry.bounds, baking);
      if (entry.root) entry.root.visible = entry.activity.visible;
      if (!update) continue;
      const level = baking ? 0 : classmateLod(camera.position.distanceToSquared(entry.bounds.center), entry.level);
      if (level !== entry.level) {
        entry.level = level;
        for (let i = 0; i < entry.meshes.length; i++) {
          const mesh = entry.meshes[i];
          if (mesh) mesh.geometry = assets.levels[level][i];
        }
      }
      // Absolute-time poses: waking never integrates a backlog of missed
      // frames, jumps through catch-up steps or loses the animation phase.
      const t = time + entry.phase;
      if (entry.torso) {
        entry.torso.rotation.x = Math.sin(t * 0.7) * 0.022;
        entry.torso.position.y = Math.sin(t * 1.1) * 0.012;
      }
      if (entry.arm) {
        entry.arm.rotation.x = entry.writing ? -0.9 + Math.sin(t * 3.1) * 0.14 : -0.55;
        entry.arm.rotation.z = entry.writing ? Math.sin(t * 2.4) * 0.09 : 0;
      }
    }
  });

  return (
    // Shared resources belong to the bounded cache, not individual meshes.
    <group dispose={null}>
      {entries.map((entry, index) => {
        const geometry = assets.levels[0];
        const jacket = assets.materials.jackets[index];
        return (
          <group key={index} name={`Classmate-${index}`} ref={node => { entry.root = node; }} position={[...entry.position]}>
            <group ref={node => { entry.torso = node; }} userData={{ classroomAnimated: true }}>
              <mesh ref={node => { entry.meshes[0] = node; }} position={[0, 0.62, 0]} castShadow geometry={geometry[0]} material={jacket} />
              <mesh ref={node => { entry.meshes[1] = node; }} position={[0, 0.86, 0.01]} geometry={geometry[1]} material={assets.materials.scarf} />
              <mesh ref={node => { entry.meshes[2] = node; }} position={[0, 1.05, 0]} castShadow geometry={geometry[2]} material={assets.materials.head} />
              <mesh ref={node => { entry.meshes[3] = node; }} position={[0, 1.11, -0.01]} geometry={geometry[3]} material={assets.materials.hat} />
              <group ref={node => { entry.arm = node; }} position={[0.17, 0.76, 0.06]} userData={{ classroomAnimated: true }}>
                <mesh ref={node => { entry.meshes[4] = node; }} position={[0, -0.02, 0.2]} rotation={[Math.PI / 2, 0, 0]} geometry={geometry[4]} material={jacket} />
              </group>
              <mesh ref={node => { entry.meshes[5] = node; }} position={[-0.2, 0.66, 0.12]} rotation={[1.15, 0, 0]} geometry={geometry[5]} material={jacket} />
            </group>
            <mesh ref={node => { entry.meshes[6] = node; }} position={[0, 0.24, 0.16]} rotation={[1.35, 0, 0]} geometry={geometry[6]} material={assets.materials.legs} />
          </group>
        );
      })}
    </group>
  );
}

export default memo(Classmates);
