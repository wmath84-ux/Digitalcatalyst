// src/nature3d/engine/dayBed.ts
//
// THE VINTAGE DAY BED — the learner's seat.
//
// "Vintage Day Bed" by Poly Haven (CC0 — free of all known copyright
// restrictions, no credit required; the URL is kept so the asset can be
// traced to its source):
//   https://polyhaven.com/a/vintage_day_bed
//
// It replaces the old procedural rustic chair ("chair ki jagah") as the seat
// the boy occupies between the desk and the meadow. The model ships in
// `public/sanctuary/models/` — the sanctuary is OFFLINE-FIRST, so nothing
// here is hot-linked at runtime (same convention as the plant fields).
//
// ── Placement ───────────────────────────────────────────────────────────
//
// Authored model: 1.97 m (x) × 0.855 m (z) × 1.13 m (y); the cushion top
// sits at y = 0.55 and the backrest runs along the local −z end.
//
// The learner faces −z (the board side) with his back to +z, so the mesh is
// turned half a turn: the backrest lands behind him and the open end faces
// the desk. The cushion top is scaled to y = 0.82 — exactly the old chair
// seat's top — so the boy keeps his 0.05 m "sunk into the seat" pose
// without touching anything else (eye height, the desk, the board arc, the
// trek start are all anchored to him and stay untouched).
//
// The seated figure has since been removed, so the bed no longer has to line
// up with anyone. It is now drawn at 2× the authored size (roughly 5.9 m wide,
// 2.5 m deep, 3.4 m tall) and stands alone in front of the board; the centre
// moved to z = 3.6 so the front edge keeps its old z ≈ 2.33 clearance from the
// desk's back edge at 1.96.

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

/**
 * World z of the bed centre. Moved from 2.9 to 3.6 when the bed was doubled:
 * at 2× the bed's depth grows 0.855 m → 2.55 m, so the old centre would have
 * pushed the front edge to z ≈ 1.63 — inside the desk, whose back edge is at
 * 1.96. At 3.6 the front edge lands at z ≈ 2.33 again, the same clearance the
 * single-size bed had.
 */
const BED_Z = 3.6;
/**
 * 0.82 m (the seat height the desk was built around) / 0.55 m (the authored
 * cushion top). Doubled on request: the bed now stands roughly 1.64 m tall, so
 * the cushion top sits near a normal adult seat height instead of a child's.
 *
 * It is no longer matched to the desk height. That is deliberate — the seated
 * figure it used to align with is gone, so the bed is sized on its own rather
 * than being pinned to a prop that is no longer next to it.
 */
const SCALE = 2 * (0.82 / 0.55);

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
        // Half turn: the authored backrest (local −z) moves behind the boy.
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
