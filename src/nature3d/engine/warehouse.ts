// src/nature3d/engine/warehouse.ts
//
// THE ABANDONED WAREHOUSE.
//
// "Abandoned Warehouse" by Arsen Ismailov (CC BY 4.0 — attribution required;
// the URL is the credit, and the same line ships in the model's CREDIT file):
//   https://sketchfab.com/3d-models/abandoned-warehouse-698a34300af34095ac6593f348585daa
//
// The sanctuary is OFFLINE-FIRST, so the runtime files are a mobile-diet bake
// of that model in `public/sanctuary/models/` — nothing here is hot-linked.
// Plan is the baked 30 m (XZ centred, floor at local y = 0). The walls are
// scaled to 60 m above the yard — height only, so the footprint still fits
// 30 m to the student's right. Seven textured meshes
// (wall, roof, concrete, steps, metal, window, door — 3 666 triangles) plus
// a 236-triangle vertex-colour impostor.
//
// ── Why it does not cost a frame ────────────────────────────────────────
//
// Same diet as the day bed and the plant fields, not a new path:
//
//   * Static. The group matrix is written once and frozen
//     (`matrixAutoUpdate = false`), so the frame loop never touches it.
//   * LOD is one squared-distance compare with hysteresis, run from the
//     ambient tick (the same staggered slot the grass already uses). Near:
//     the seven meshes. Past ~88 m the steps, the truss and the doors hide
//     (they are the triangle mass, and they are unreadable there). Past
//     ~340 m only the impostor remains — one Lambert draw, no texture.
//   * The colour camera never draws the shadow hull. It lives on layer 1;
//     three r180's shadow walk tests the COLOUR camera's layers, so the
//     scene enables layer 1 only for the duration of that walk (see
//     scene.ts). The hull is the impostor's 236 triangles, and the shadow
//     map itself only refreshes when the camera has moved.
//   * Low tier swaps the textured shell to Lambert (the `cheapPlants` diet)
//     and the scene runs `halfPrecisionTree` over the group. No physical
//     material, no transmission, no per-frame allocation.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { QualityBudget } from "./quality";
import { terrainHeight } from "./terrain";
import { WAREHOUSE_X, WAREHOUSE_YAW, WAREHOUSE_Z } from "./warehouseSite";

export interface Warehouse {
  group: THREE.Group;
  /**
   * Squared-distance LOD. Allocation-free: a handful of compares and
   * visibility flips, no vectors, no materials, no traversal.
   */
  update(camPos: THREE.Vector3): void;
  dispose(): void;
}

const MODEL_URL = "sanctuary/models/abandoned_warehouse.gltf";

/** Hide the truss, the steps and the doors past this distance. */
const NEAR_OUT = 88 * 88;
/** Bring them back inside this — the gap is the hysteresis. */
const NEAR_IN = 72 * 72;
/** Impostor only, past this. */
const FAR_OUT = 340 * 340;
/** Shell returns inside this. */
const FAR_IN = 300 * 300;

const DETAIL = new Set(["warehouse-steps", "warehouse-metal", "warehouse-door"]);

/**
 * How far the floor is sunk into the yard, after the height scale.
 *
 * The bake is 5.4 m tall. The wall the learner has to be able to see is
 * 60 m, so the geometry is scaled on Y only — the plan stays the 30 m the
 * yard was cut for, which is what lets the glazed face sit 30 m to the
 * student's right instead of covering the chair. The concrete curb is
 * 0.435 m in the bake; after that scale it stands about 4.8 m proud of the
 * floor. Sinking by that plus a bite buries the curb, and the corrugation
 * comes out of the dirt.
 */
const AUTHORED_HEIGHT = 5.4;
const TARGET_HEIGHT = 60;
const CURB_TOP = 0.435;
const BITE = 0.35;
// The curb is buried, so a scale of 60/5.4 would leave the roof 5 m short of
// the ground line. Scale so the roof, not the buried floor, is 60 m up.
const SCALE_Y = (TARGET_HEIGHT + BITE) / (AUTHORED_HEIGHT - CURB_TOP);
const SINK = CURB_TOP * SCALE_Y + BITE;

/**
 * Concrete lip under the walls. The group origin is `SINK` metres below the
 * yard, so the ground line is at local y = SINK. The lip starts just under
 * that line — buried on the flat yard, visible only if a coarse terrain
 * triangle dips, where it reads as foundation instead of a gap.
 */
function foundationSkirt(shadows: boolean): THREE.Mesh {
  // Inside the wall faces. A skirt proud of the walls reads as a concrete
  // pad, which is the thing that made the shell look perched.
  const hx = 12.4;
  const hz = 14.4;
  // Ground is at local y = SINK (the group origin is that far below the
  // yard). The skirt's top sits just under that line. These are world
  // metres: the height scale is baked into the shell, not the group.
  const y0 = SINK - 0.18;
  const y1 = SINK - 1.35;
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
      const buried = quad[k + 1] < 0 ? 0.55 : 0.72;
      colors[p] = buried;
      colors[p + 1] = buried * 0.96;
      colors[p + 2] = buried * 0.88;
      p += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "warehouse-skirt";
  mesh.castShadow = false;
  mesh.receiveShadow = shadows;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * The levelled pad under the footprint, minus `SINK`. The yard is flat (see
 * `levelWarehouseGround`), so the min of the samples IS the pad. Once, at load.
 */
function seatY(): number {
  const c = Math.cos(WAREHOUSE_YAW);
  const s = Math.sin(WAREHOUSE_YAW);
  let min = Infinity;
  for (let ix = -2; ix <= 2; ix += 1) {
    for (let iz = -2; iz <= 2; iz += 1) {
      const lx = ix * 6.5;
      const lz = iz * 7.5;
      const h = terrainHeight(
        WAREHOUSE_X + lx * c + lz * s,
        WAREHOUSE_Z - lx * s + lz * c,
      );
      if (h < min) min = h;
    }
  }
  return min - SINK;
}

export function createWarehouse(budget: QualityBudget, anisotropy: number): Promise<Warehouse> {
  const shadows = budget.shadowMapSize > 0;
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        const group = new THREE.Group();
        group.name = "abandoned-warehouse";

        const shell: THREE.Object3D[] = [];
        const detail: THREE.Object3D[] = [];
        const impostors: THREE.Mesh[] = [];
        const textures: THREE.Texture[] = [];

        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          // Bake the node's transform into the geometry and re-parent, so the
          // group carries one matrix and every child is identity. The bake
          // already authors identity nodes; this keeps a future re-bake honest.
          mesh.geometry.applyMatrix4(mesh.matrixWorld);
          // Height only. A uniform scale to 60 m would make a ~300 m footprint
          // and the building would cover the chair it is supposed to stand
          // beside. The plan stays the baked 30 m. The steps are left at
          // their authored height: stretching them lifts a 0.6 m stoop into
          // a plinth beside the wall, which is the "not on the ground" read.
          // Unscaled, they sit at the floor, and the sink buries them.
          if (mesh.name !== "warehouse-steps") mesh.geometry.scale(1, SCALE_Y, 1);
          mesh.position.set(0, 0, 0);
          mesh.rotation.set(0, 0, 0);
          mesh.scale.set(1, 1, 1);
          mesh.updateMatrix();
          mesh.matrixAutoUpdate = false;
          mesh.castShadow = false;
          mesh.receiveShadow = shadows;
          mesh.frustumCulled = true;

          if (mesh.name === "warehouse-impostor") {
            const previous = mesh.material as THREE.Material;
            mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true });
            previous.dispose();
            mesh.receiveShadow = false;
            impostors.push(mesh);
            return;
          }

          let mat = mesh.material as THREE.MeshStandardMaterial;
          if (budget.cheapPlants) {
            const lambert = new THREE.MeshLambertMaterial({
              map: mat.map,
              color: mat.color,
              side: mat.side,
            });
            mat.dispose();
            mesh.material = lambert;
            mat = lambert as unknown as THREE.MeshStandardMaterial;
          } else {
            mat.metalness = 0;
          }
          if (mat.map) {
            mat.map.anisotropy = anisotropy;
            mat.map.colorSpace = THREE.SRGBColorSpace;
            // The window cell is a repeating pane, authored in world metres.
            // The other maps are atlas crops and stay in 0–1, so repeat is
            // harmless on them and required on the clerestory.
            if (mesh.name === "warehouse-window") {
              // The pane is authored in the bake's metres. Clone so the
              // height scale retile does not stretch a shared atlas.
              mat.map = mat.map.clone();
              mat.map.wrapS = THREE.RepeatWrapping;
              mat.map.wrapT = THREE.RepeatWrapping;
              mat.map.repeat.y = SCALE_Y;
            }
            textures.push(mat.map);
          }

          group.add(mesh);
          if (DETAIL.has(mesh.name)) detail.push(mesh);
          else shell.push(mesh);
        });

        const far = impostors[0];
        if (!far || shell.length === 0) {
          reject(new Error("warehouse: baked model is missing its shell"));
          return;
        }
        group.add(far);

        // The shadow hull shares the impostor's geometry. It is NOT a child
        // the colour camera draws: layer 1, and the scene only enables that
        // layer inside the shadow walk. 236 triangles, refreshed with the
        // static shadow map, never per frame.
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

        // Buried concrete under the walls. Eight triangles, no texture,
        // hidden with the shell past the far LOD. See foundationSkirt.
        const skirt = foundationSkirt(shadows);
        group.add(skirt);
        shell.push(skirt);

        group.position.set(WAREHOUSE_X, seatY(), WAREHOUSE_Z);
        group.rotation.y = WAREHOUSE_YAW;
        group.updateMatrix();
        group.matrixAutoUpdate = false;
        group.updateMatrixWorld(true);

        // Boot on the impostor. The establishing shot is 1.5 km out; the
        // first update() promotes the shell if the camera is already close.
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

        resolve({
          group,
          update(camPos) {
            const dx = camPos.x - WAREHOUSE_X;
            const dy = camPos.y - group.position.y;
            const dz = camPos.z - WAREHOUSE_Z;
            const d2 = dx * dx + dy * dy + dz * dz;
            // Chained so a single call can cross both bands (a preset that
            // jumps from the impostor straight to the facade).
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
            // Hull and impostor share one geometry — dispose it once.
            far.geometry.dispose();
            skirt.geometry.dispose();
            mats.forEach((m) => m.dispose());
            for (let i = 0; i < textures.length; i += 1) textures[i].dispose();
            group.clear();
          },
        });
      },
      undefined,
      (err) => {
        console.warn("warehouse: model failed to load — the pad stays empty", err);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
