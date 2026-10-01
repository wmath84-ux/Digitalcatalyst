// src/nature3d/engine/dayBed.ts
//
// THE VINTAGE DAY BED — the learner's seat.
//
// "Vintage Day Bed" by Poly Haven (CC0 — free of all known copyright
// restrictions, no credit required; the URL is kept so the asset can be
// traced to its source):
//   https://polyhaven.com/a/vintage_day_bed
//
// The sofa stays on its own in the study clearing; there is NO seated student.
// The local asset remains offline-first, with no reference-project environment
// or hot-linked meshes imported.
//
// Authored model: 1.97 m (x) × 0.855 m (z) × 1.13 m (y). Its open side
// faces the desk/board (−Z); the half turn puts the backrest on +Z.
//
// No seated figure is mounted. The current sofa's scale is doubled on ALL
// axes, from 2*(0.82/0.55) to 4*(0.82/0.55). Approximate final dimensions:
// 11.75 m wide × 5.10 m deep × 6.74 m tall. These are intentionally large —
// the request was twice the existing sofa, not twice the source model.
// Its centre moves backward only enough to preserve the old desk clearance.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TextureLoader } from "three";
import type { QualityBudget } from "./quality";
import { terrainHeight } from "./terrain";

export interface DayBed {
  group: THREE.Group;
  /** The shared bed material, published for the winter pass. */
  materials: THREE.Material[];
  dispose(): void;
}

const MODEL_URL = "sanctuary/models/vintage_day_bed.gltf";
const ARM_URL = "sanctuary/models/textures/vintage_day_bed_arm_1k.jpg";

export const PREVIOUS_DAY_BED_SCALE = 2 * (0.82 / 0.55);
/** Exactly twice the size that was rendered before this change, on all axes. */
export const DAY_BED_SCALE = PREVIOUS_DAY_BED_SCALE * 2;
/** Keep the front edge at its previous position, clear of the study desk. */
export const DAY_BED_Z = 3.6 + (0.855 * PREVIOUS_DAY_BED_SCALE) / 2;
const BED_Z = DAY_BED_Z;
const SCALE = DAY_BED_SCALE;

export function createDayBed(budget: QualityBudget, anisotropy: number): Promise<DayBed> {
  const shadows = budget.shadowMapSize > 0;
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        let found: THREE.Mesh | null = null;
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && !found) found = m;
        });
        if (!found) {
          reject(new Error("dayBed: model has no mesh"));
          return;
        }
        const mesh = found as THREE.Mesh;

        const material =
          (mesh.material as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial();

        // The Poly Haven glTF carries only base colour + normal (the exporter
        // dropped the rest), so the ARM pack is patched in — R=AO, G=rough,
        // B=metal — the same patch the plant fields get. Dry wood and faded
        // fabric must not read as a shiny plastic.
        const arm = new TextureLoader().load(ARM_URL);
        material.metalnessMap = arm;
        material.roughnessMap = arm;
        material.aoMap = arm;
        material.aoMapIntensity = 0.7;
        for (const t of [
          material.map,
          material.normalMap,
          material.roughnessMap,
          material.metalnessMap,
          material.aoMap,
        ]) {
          if (t) t.anisotropy = anisotropy;
        }
        // three r151+ reads aoMap from uv1 by default; the glTF only ships
        // TEXCOORD_0, so give it the same channel explicitly.
        const geo = mesh.geometry as THREE.BufferGeometry;
        if (geo.attributes.uv && !geo.attributes.uv1) {
          geo.setAttribute("uv1", new THREE.BufferAttribute(geo.attributes.uv.array, 2));
        }

        mesh.material = material;
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        // Half turn: the authored backrest (local −z) faces away from the desk.
        mesh.rotation.y = Math.PI;
        mesh.scale.setScalar(SCALE);

        const group = new THREE.Group();
        group.name = "vintage-day-bed";
        group.add(mesh);
        group.position.set(0, terrainHeight(0, BED_Z), BED_Z);

        resolve({
          group,
          materials: [material],
          dispose() {
            geo.dispose();
            material.dispose();
            for (const t of [
              material.map,
              material.normalMap,
              material.roughnessMap,
              material.metalnessMap,
              material.aoMap,
            ]) {
              (t as THREE.Texture | null)?.dispose?.();
            }
            group.clear();
          },
        });
      },
      undefined,
      (err) => {
        console.warn("dayBed: model failed to load — the seat stays bare", err);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
