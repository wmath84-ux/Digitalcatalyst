import * as THREE from "three";
import type { QualityBudget } from "./quality";
import type { TextureSet } from "./textures";
import { BAY_AZIMUTH, terrainHeight } from "./terrain";

export interface FarImpostorForest {
  group: THREE.Group;
  materials: THREE.Material[];
  update(cameraPos: THREE.Vector3): void;
  dispose(): void;
}

function countFor(tier: QualityBudget["tier"]): number {
  switch (tier) {
    case "low": return 44;
    case "medium": return 68;
    case "high": return 92;
    case "ultra": return 124;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Far vegetation impostors: the PUBG/HLOD rule for forests. The horizon reads
 * dense, but it is only two alpha-tested instanced-card buckets, not hundreds
 * of full tree meshes. Cards are static and coarse; near real trees still come
 * from `flora.ts`.
 */
export function createFarImpostorForest(tex: TextureSet, budget: QualityBudget): FarImpostorForest {
  const group = new THREE.Group();
  group.name = "far-vegetation-impostors";
  const total = countFor(budget.tier);
  const palmCount = Math.floor(total * 0.28);
  const broadCount = total - palmCount;

  const broadMat = new THREE.MeshBasicMaterial({
    map: tex.canopy,
    transparent: true,
    alphaTest: 0.28,
    depthWrite: true,
    fog: true,
    color: 0x6a7b8c,
    side: THREE.DoubleSide,
  });
  const palmMat = new THREE.MeshBasicMaterial({
    map: tex.palmCanopy,
    transparent: true,
    alphaTest: 0.24,
    depthWrite: true,
    fog: true,
    color: 0x6f7f72,
    side: THREE.DoubleSide,
  });
  const broadGeo = new THREE.PlaneGeometry(34, 38, 1, 1);
  const palmGeo = new THREE.PlaneGeometry(28, 34, 1, 1);
  // Pivot at ground so scale changes never sink cards below terrain.
  broadGeo.translate(0, 19, 0);
  palmGeo.translate(0, 17, 0);

  const broad = new THREE.InstancedMesh(broadGeo, broadMat, broadCount);
  const palm = new THREE.InstancedMesh(palmGeo, palmMat, palmCount);
  broad.name = "far-broadleaf-impostors";
  palm.name = "far-palm-impostors";

  const rng = mulberry32(0x8f05e57);
  const dummy = new THREE.Object3D();
  const place = (mesh: THREE.InstancedMesh, count: number, baseRadius: number, spread: number, scaleBase: number) => {
    for (let i = 0; i < count; i += 1) {
      let a = rng() * Math.PI * 2;
      // Leave the sea bay open; trees should not wall off the water view.
      const d = Math.abs(Math.atan2(Math.sin(a - BAY_AZIMUTH), Math.cos(a - BAY_AZIMUTH)));
      if (d < 0.36) a += 0.62;
      const r = baseRadius + rng() * spread;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrainHeight(x, z) - 0.4;
      dummy.position.set(x, y, z);
      // Face roughly toward the island centre. A small jitter stops a perfect ring.
      dummy.rotation.set(0, Math.atan2(x, z) + (rng() - 0.5) * 0.35, 0);
      const s = scaleBase * (0.75 + rng() * 0.7);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  };
  place(broad, broadCount, 560, 420, 1.0);
  place(palm, palmCount, 760, 260, 0.9);

  return {
    group,
    materials: [broadMat, palmMat],
    update(cameraPos) {
      // Coarse cell streaming: if the learner is in the study/meadow band, the
      // horizon impostors are visible. If they fly very close to the ring, real
      // local terrain/props take over and the cheap backdrop sleeps.
      const r = Math.hypot(cameraPos.x, cameraPos.z);
      group.visible = r < 720 || r > 1040;
    },
    dispose() {
      broadGeo.dispose(); palmGeo.dispose(); broadMat.dispose(); palmMat.dispose(); group.clear();
    },
  };
}
