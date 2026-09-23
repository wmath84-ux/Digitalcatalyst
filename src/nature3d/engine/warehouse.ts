// src/nature3d/engine/warehouse.ts
//
// THE ABANDONED WAREHOUSE.
//
// "Abandoned Warehouse" by Arsen Ismailov (CC BY 4.0 — attribution required;
// the URL is the credit, and the same line ships in the model's CREDIT file):
//   https://sketchfab.com/3d-models/abandoned-warehouse-698a34300af34095ac6593f348585daa
//
// The learner uploads the original as one glTF Binary file:
//   public/abandoned_warehouse.glb
// which the site serves at /abandoned_warehouse.glb. Until that file is
// there, the mobile bake in public/sanctuary/models/ is the stand-in. Either
// file is measured and scaled so the shell is 60 m tall and 60 m on its long
// side, then seated on the yard 30 m east of the spot that read as empty.
//
// ── Why it does not cost a frame ────────────────────────────────────────
//
// Same diet as the day bed, not a new path:
//
//   * Static. The group matrix is written once and frozen
//     (`matrixAutoUpdate = false`), so the frame loop never touches it.
//   * LOD is one squared-distance compare with hysteresis, run from the
//     ambient tick. Near: the textured meshes. Past ~88 m the steps and the
//     truss hide. Past ~340 m only a box impostor remains — one Lambert
//     draw, no texture. An uploaded original uses that same box, so a heavy
//     file never draws at the 1.5 km boot shot.
//   * The colour camera never draws the shadow hull. It lives on layer 1;
//     the scene enables that layer only for the shadow walk. The hull is
//     the impostor's triangles, refreshed with the static shadow map.
//   * Low tier swaps the textured shell to Lambert and the scene runs
//     `halfPrecisionTree` over the group. No transmission, no per-frame
//     allocation.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { QualityBudget } from "./quality";
import { terrainHeight } from "./terrain";
import { WAREHOUSE_HEIGHT, WAREHOUSE_X, WAREHOUSE_YAW, WAREHOUSE_Z } from "./warehouseSite";

export interface Warehouse {
  group: THREE.Group;
  /**
   * Squared-distance LOD. Allocation-free: a handful of compares and
   * visibility flips, no vectors, no materials, no traversal.
   */
  update(camPos: THREE.Vector3): void;
  dispose(): void;
}

/** The file the learner uploads to the repo. Served from `public/`. */
const UPLOADED_URL = "/abandoned_warehouse.glb";
/** Mobile bake, used until that upload is present. */
const BAKED_URL = "/sanctuary/models/abandoned_warehouse.gltf";

/** Hide the truss and the steps past this distance. */
const NEAR_OUT = 88 * 88;
/** Bring them back inside this — the gap is the hysteresis. */
const NEAR_IN = 72 * 72;
/** Impostor only, past this. */
const FAR_OUT = 340 * 340;
/** Shell returns inside this. */
const FAR_IN = 300 * 300;

const DETAIL = new Set(["warehouse-steps", "warehouse-metal"]);

/** Long side after scale, metres. Height is `WAREHOUSE_HEIGHT`. */
const TARGET_LONG = 60;
/** How far the floor is buried so the wall meets the dirt, not a gap. */
const BITE = 0.35;

function loadGltf(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function parseGltf(data: ArrayBuffer, path: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(data, path, resolve, (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/**
 * The upload is optional. A missing file must not log a load error, and a
 * host that rewrites unknown paths to index.html must not be parsed as glTF.
 * A real glb starts with the ASCII magic `glTF`.
 */
async function loadModel(): Promise<GLTF> {
  try {
    const res = await fetch(UPLOADED_URL);
    if (res.ok) {
      const data = await res.arrayBuffer();
      const magic = new Uint8Array(data, 0, 4);
      if (magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46) {
        return parseGltf(data, "/");
      }
    }
  } catch {
    // No upload yet — the bake below is the warehouse.
  }
  return loadGltf(BAKED_URL);
}

/**
 * Concrete lip under the walls, in group space. The ground line is local
 * y = 0. The lip starts just under that line and is inset from the walls,
 * so a coarse terrain triangle reads as foundation instead of a gap.
 */
function foundationSkirt(shadows: boolean, halfX: number, halfZ: number): THREE.Mesh {
  const hx = Math.max(1, halfX - 0.8);
  const hz = Math.max(1, halfZ - 0.8);
  const y0 = -0.08;
  const y1 = -1.4;
  const positions = new Float32Array(4 * 6 * 3);
  const colors = new Float32Array(4 * 6 * 3);
  const corners: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  let p = 0;
  for (let i = 0; i < 4; i += 1) {
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[(i + 1) % 4];
    const quad = [x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0];
    for (let k = 0; k < quad.length; k += 3) {
      positions[p] = quad[k];
      positions[p + 1] = quad[k + 1];
      positions[p + 2] = quad[k + 2];
      colors[p] = 0.42;
      colors[p + 1] = 0.4;
      colors[p + 2] = 0.36;
      p += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "warehouse-skirt";
  mesh.castShadow = false;
  mesh.receiveShadow = shadows;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** A 12-triangle stand-in so a heavy upload never draws at the boot shot. */
function boxImpostor(halfX: number, halfZ: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(halfX * 2, WAREHOUSE_HEIGHT, halfZ * 2);
  geo.translate(0, WAREHOUSE_HEIGHT / 2, 0);
  const color = new Float32Array(geo.attributes.position.count * 3);
  const position = geo.attributes.position;
  const roofY = WAREHOUSE_HEIGHT * 0.82;
  for (let i = 0; i < position.count; i += 1) {
    const roof = position.getY(i) > roofY;
    color[i * 3] = roof ? 0.55 : 0.34;
    color[i * 3 + 1] = roof ? 0.3 : 0.32;
    color[i * 3 + 2] = roof ? 0.16 : 0.29;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "warehouse-impostor";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function prepareMaterial(
  mesh: THREE.Mesh,
  budget: QualityBudget,
  anisotropy: number,
  scaleXZ: number,
  scaleY: number,
): THREE.Texture[] {
  const textures: THREE.Texture[] = [];
  const source = mesh.material as THREE.Material | THREE.Material[];
  const first = Array.isArray(source) ? source[0] : source;
  const std = first as THREE.MeshStandardMaterial;
  const map = std?.map ?? null;
  if (budget.cheapPlants || !std?.isMeshStandardMaterial) {
    const lambert = new THREE.MeshLambertMaterial({
      map,
      color: std?.color ?? new THREE.Color(0x8a8174),
      side: THREE.DoubleSide,
    });
    if (Array.isArray(source)) source.forEach((m) => m.dispose());
    else first?.dispose();
    mesh.material = lambert;
  } else {
    std.metalness = 0;
    std.side = THREE.DoubleSide;
    if (!map) std.color.set(0x8a8174);
  }
  if (map) {
    map.anisotropy = anisotropy;
    map.colorSpace = THREE.SRGBColorSpace;
    // The bake's wall and roof UVs are in metres. An upload is 0–1 and must
    // keep the repeat the file authored, or the original tiles into noise.
    if (mesh.name.startsWith("warehouse-") && mesh.name !== "warehouse-door") {
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      const vertical = mesh.name === "warehouse-wall" || mesh.name === "warehouse-window";
      map.repeat.set(scaleXZ, vertical ? scaleY : scaleXZ);
    }
    textures.push(map);
  }
  return textures;
}

export function createWarehouse(budget: QualityBudget, anisotropy: number): Promise<Warehouse> {
  const shadows = budget.shadowMapSize > 0;
  return loadModel().then((gltf) => {
      const group = new THREE.Group();
      group.name = "abandoned-warehouse";

      const meshes: THREE.Mesh[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.applyMatrix4(mesh.matrixWorld);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        mesh.updateMatrix();
        meshes.push(mesh);
      });
      if (meshes.length === 0) {
        throw new Error("warehouse: model has no meshes");
      }

      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (const mesh of meshes) {
        const position = mesh.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i += 1) {
          v.fromBufferAttribute(position as THREE.BufferAttribute, i);
          box.expandByPoint(v);
        }
      }
      const size = box.getSize(new THREE.Vector3());
      const height = Math.max(size.y, 0.01);
      const long = Math.max(size.x, size.z, 0.01);
      const scaleY = (WAREHOUSE_HEIGHT + BITE) / height;
      const scaleXZ = TARGET_LONG / long;
      const midX = (box.min.x + box.max.x) / 2;
      const midZ = (box.min.z + box.max.z) / 2;
      const translateX = -midX * scaleXZ;
      const translateY = -BITE - box.min.y * scaleY;
      const translateZ = -midZ * scaleXZ;

      const shell: THREE.Object3D[] = [];
      const detail: THREE.Object3D[] = [];
      const textures: THREE.Texture[] = [];
      let authoredImpostor: THREE.Mesh | null = null;

      for (const mesh of meshes) {
        mesh.geometry.scale(scaleXZ, scaleY, scaleXZ);
        mesh.geometry.translate(translateX, translateY, translateZ);
        mesh.geometry.computeBoundingSphere();
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.castShadow = false;
        mesh.receiveShadow = shadows;
        mesh.frustumCulled = true;

        if (mesh.name === "warehouse-impostor") {
          const color = mesh.geometry.getAttribute("color");
          const position = mesh.geometry.getAttribute("position");
          if (color && position) {
            const roofY = WAREHOUSE_HEIGHT * 0.82;
            for (let i = 0; i < color.count; i += 1) {
              const roof = position.getY(i) > roofY;
              color.setXYZ(i, roof ? 0.55 : 0.34, roof ? 0.3 : 0.32, roof ? 0.16 : 0.29);
            }
            color.needsUpdate = true;
          }
          const previous = mesh.material as THREE.Material;
          mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true });
          previous.dispose();
          mesh.receiveShadow = false;
          authoredImpostor = mesh;
          continue;
        }

        textures.push(...prepareMaterial(mesh, budget, anisotropy, scaleXZ, scaleY));
        group.add(mesh);
        if (DETAIL.has(mesh.name)) detail.push(mesh);
        else shell.push(mesh);
      }

      const halfX = (size.x * scaleXZ) / 2;
      const halfZ = (size.z * scaleXZ) / 2;
      const far = authoredImpostor ?? boxImpostor(halfX, halfZ);
      group.add(far);

      let hull: THREE.Mesh | null = null;
      if (shadows) {
        hull = new THREE.Mesh(far.geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
        hull.name = "warehouse-shadow";
        hull.layers.set(1);
        hull.castShadow = true;
        hull.receiveShadow = false;
        hull.frustumCulled = true;
        hull.matrixAutoUpdate = false;
        group.add(hull);
      }

      const skirt = foundationSkirt(shadows, halfX, halfZ);
      group.add(skirt);
      shell.push(skirt);

      group.position.set(WAREHOUSE_X, terrainHeight(WAREHOUSE_X, WAREHOUSE_Z), WAREHOUSE_Z);
      group.rotation.y = WAREHOUSE_YAW;
      group.updateMatrix();
      group.matrixAutoUpdate = false;
      group.updateMatrixWorld(true);

      // Boot on the impostor. The establishing shot is 1.5 km out; the first
      // update() promotes the shell if the camera is already close.
      far.visible = true;
      for (let i = 0; i < shell.length; i += 1) shell[i].visible = false;
      for (let i = 0; i < detail.length; i += 1) detail[i].visible = false;

      let lod = 2;
      const apply = (next: number) => {
        if (next === lod) return;
        lod = next;
        const showShell = next < 2;
        const showDetail = next === 0;
        for (let i = 0; i < shell.length; i += 1) shell[i].visible = showShell;
        for (let i = 0; i < detail.length; i += 1) detail[i].visible = showDetail;
        far.visible = next === 2;
      };

      return {
        group,
        update(camPos) {
          const dx = camPos.x - WAREHOUSE_X;
          const dy = camPos.y - group.position.y;
          const dz = camPos.z - WAREHOUSE_Z;
          const d2 = dx * dx + dy * dy + dz * dz;
          let next = lod;
          if (next === 2 && d2 < FAR_IN) next = 1;
          if (next === 0 && d2 > NEAR_OUT) next = 1;
          if (next === 1 && d2 < NEAR_IN) next = 0;
          else if (next === 1 && d2 > FAR_OUT) next = 2;
          apply(next);
        },
        dispose() {
          const mats = new Set<THREE.Material>();
          group.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const m = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(m)) m.forEach((x) => mats.add(x));
            else if (m) mats.add(m);
          });
          far.geometry.dispose();
          if (hull && hull.geometry !== far.geometry) hull.geometry.dispose();
          skirt.geometry.dispose();
          mats.forEach((m) => m.dispose());
          for (let i = 0; i < textures.length; i += 1) textures[i].dispose();
          group.clear();
        },
      };
    });
}
