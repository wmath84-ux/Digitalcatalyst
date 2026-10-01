import * as THREE from "three";
import type { CharacterCollider } from "./characterCollision";
import type { QualityBudget } from "./quality";
import type { BeachHouseSite } from "./beachHouseSite";
import { HOUSE_RIDGE } from "./beachHouseSite";
import { terrainHeight } from "./terrain";
import { WAREHOUSE_HALF_X, WAREHOUSE_HALF_Z, WAREHOUSE_HEIGHT, WAREHOUSE_X, WAREHOUSE_YAW, WAREHOUSE_Z } from "./warehouseSite";

export interface SanctuaryInteriors {
  group: THREE.Group;
  materials: THREE.Material[];
  colliders: readonly CharacterCollider[];
  update(cameraPos: THREE.Vector3): void;
  dispose(): void;
}

type Placement = {
  x: number; z: number; yaw: number; baseY: number; scale: number;
  kind: "house" | "villa";
};

function worldPoint(p: Placement, lx: number, lz: number): [number, number] {
  const cos = Math.cos(p.yaw);
  const sin = Math.sin(p.yaw);
  return [p.x + cos * lx + sin * lz, p.z - sin * lx + cos * lz];
}

function collider(id: string, p: Placement, lx: number, lz: number, halfX: number, halfZ: number, height: number): CharacterCollider {
  const [x, z] = worldPoint(p, lx, lz);
  return { id, kind: "box", x, z, yaw: p.yaw, halfX, halfZ, baseY: p.baseY, height, cover: height > 0.7 };
}

/**
 * Cheap authored interiors. This is not a heavy GLB import: it is a few shared
 * box geometries instanced into every house/villa so entering a building no
 * longer reveals an empty shell. It follows the PUBG rule: simple collision
 * boxes for gameplay, simple shared meshes for visuals, no per-object updates.
 */
export function createSanctuaryInteriors(sites: readonly BeachHouseSite[], budget: QualityBudget): SanctuaryInteriors {
  const group = new THREE.Group();
  group.name = "sanctuary-interiors";

  const wood = new THREE.MeshLambertMaterial({ color: 0x4a3c31 });
  const fabric = new THREE.MeshLambertMaterial({ color: 0x8c8476 });
  const clay = new THREE.MeshLambertMaterial({ color: 0x5e503f });
  const materials = [wood, fabric, clay];

  const placements: Placement[] = sites.map((s) => ({ x: s.x, z: s.z, yaw: s.yaw, baseY: s.padY + 0.03, scale: s.scale, kind: "house" }));
  placements.push({
    x: WAREHOUSE_X,
    z: WAREHOUSE_Z,
    yaw: WAREHOUSE_YAW,
    baseY: terrainHeight(WAREHOUSE_X, WAREHOUSE_Z) + 0.04,
    scale: Math.max(1, WAREHOUSE_HEIGHT / 30),
    kind: "villa",
  });

  const houseCount = sites.length;
  const bedGeo = new THREE.BoxGeometry(3.2, 0.55, 1.55);
  const tableGeo = new THREE.BoxGeometry(1.45, 0.72, 1.05);
  const benchGeo = new THREE.BoxGeometry(1.95, 0.46, 0.55);
  const crateGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);

  const bedMesh = new THREE.InstancedMesh(bedGeo, fabric, houseCount + 3);
  const tableMesh = new THREE.InstancedMesh(tableGeo, wood, houseCount + 3);
  const benchMesh = new THREE.InstancedMesh(benchGeo, wood, houseCount * 2 + 4);
  const crateMesh = new THREE.InstancedMesh(crateGeo, clay, houseCount * 2 + 5);
  const meshes = [bedMesh, tableMesh, benchMesh, crateMesh];
  bedMesh.name = "interior-beds";
  tableMesh.name = "interior-tables";
  benchMesh.name = "interior-benches";
  crateMesh.name = "interior-crates";

  const dummy = new THREE.Object3D();
  const colliders: CharacterCollider[] = [];
  const counts = new Map<THREE.InstancedMesh, number>(meshes.map((m) => [m, 0]));

  const place = (mesh: THREE.InstancedMesh, p: Placement, lx: number, lz: number, sx: number, sy: number, sz: number, yawOffset = 0) => {
    const slot = counts.get(mesh) ?? 0;
    if (slot >= mesh.instanceMatrix.count) return;
    const [x, z] = worldPoint(p, lx * p.scale, lz * p.scale);
    dummy.position.set(x, p.baseY, z);
    dummy.rotation.set(0, p.yaw + yawOffset, 0);
    dummy.scale.set(sx * p.scale, sy * p.scale, sz * p.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    counts.set(mesh, slot + 1);
  };

  placements.forEach((p, i) => {
    const villa = p.kind === "villa";
    const bedScale = villa ? 1.35 : 1;
    const tableScale = villa ? 1.45 : 1;
    place(bedMesh, p, villa ? -7 : -3.1, villa ? -7 : -2.8, bedScale, 1, bedScale, Math.PI * 0.5);
    place(tableMesh, p, villa ? 4 : 2.2, villa ? -2 : 0.2, tableScale, 1, tableScale);
    place(benchMesh, p, villa ? 4 : 2.2, villa ? 1.0 : 2.0, tableScale, 1, tableScale);
    place(benchMesh, p, villa ? -4 : -2.0, villa ? 4.8 : 2.6, tableScale, 1, tableScale, Math.PI * 0.5);
    place(crateMesh, p, villa ? 8 : 3.5, villa ? 7 : 3.6, villa ? 1.25 : 1, villa ? 1.2 : 1, villa ? 1.25 : 1);
    place(crateMesh, p, villa ? -8 : -3.7, villa ? 6.5 : 3.2, villa ? 1.15 : 0.85, villa ? 1.1 : 0.85, villa ? 1.15 : 0.85);

    const h = villa ? 1.0 : Math.min(1.1 * p.scale, 2.0);
    colliders.push(
      collider(`${p.kind}-${i}-bed`, p, villa ? -7 : -3.1 * p.scale, villa ? -7 : -2.8 * p.scale, (villa ? 2.2 : 1.6) * p.scale, 0.85 * p.scale, h),
      collider(`${p.kind}-${i}-table`, p, villa ? 4 : 2.2 * p.scale, villa ? -2 : 0.2 * p.scale, 0.9 * p.scale, 0.7 * p.scale, 0.9 * p.scale),
    );
  });

  for (const mesh of meshes) {
    mesh.count = counts.get(mesh) ?? 0;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = budget.shadowMapSize > 0;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  let visible = true;
  return {
    group,
    materials,
    colliders,
    update(cameraPos) {
      const r = Math.hypot(cameraPos.x, cameraPos.z);
      const want = r < 1020;
      if (want === visible) return;
      visible = want;
      group.visible = want;
    },
    dispose() {
      for (const g of [bedGeo, tableGeo, benchGeo, crateGeo]) g.dispose();
      for (const m of materials) m.dispose();
      group.clear();
    },
  };
}
