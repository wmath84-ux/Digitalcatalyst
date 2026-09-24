// src/nature3d/engine/warehouse.ts
//
// THE RUSTY-ROOF VILLA. It replaces the abandoned warehouse.
//
// The file is the learner's own upload, baked for the phone:
//   public/sanctuary/models/rusty_roof_house.glb
// Credit is the sibling .CREDIT.txt. The albedo, the normal and the
// proportions are the authored model. Nothing here recolors it. The bake
// only resized the maps to 1024 and simplified the mesh to ~14k triangles
// so one house does not spend the frame budget. Uniform scale turns the
// authored 0.71 m height into 30 m; the footprint follows the model, it
// is not stretched into a cube.
//
//   * Static. The group matrix is written once and frozen.
//   * Past ~1 km a 12-triangle timber box stands in, so the 1.5 km boot
//     shot does not draw the shell. Inside ~850 m the real mesh returns —
//     the shell is what the learner sees at every distance they can
//     actually orbit to (the old 260 m swap made the villa read as a bare
//     box the moment they zoomed out).
//   * The colour camera never draws the shadow hull. It lives on layer 1.
//   * Metalness is forced to 0. A Tripo roughness map often carries a
//     metal channel, and metal under this sun reads as a white box. The
//     colour map is left alone.

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

const MODEL_URL = "/sanctuary/models/rusty_roof_house.glb";

// The shell is the model all the way to a full kilometre. The orbit camera
// legitimately reaches ~1.3 km out, and the owner's world is now worth
// zooming out to see — at 260 m the villa used to swap to a 12-triangle
// timber box, which is exactly the "zoom out and the villa is just a
// square box, nothing else" report. 14 k triangles for one house is a
// rounding error next to the ~300 k of the jungle field, so the impostor
// survives only for the 1.5 km+ establishing boot shot.
/** Impostor only, past this. */
const FAR_OUT = 1000 * 1000;
/** Shell returns inside this. */
const FAR_IN = 850 * 850;

/** How far the floor is buried so the wall meets the dirt, not a gap. */
const BITE = 0.4;

function loadGltf(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/**
 * Concrete lip under the walls, in group space. The ground line is local
 * y = 0. The lip starts just under that line and is inset from the walls,
 * so a coarse terrain triangle reads as foundation instead of a gap.
 */
function foundationSkirt(shadows: boolean, halfX: number, halfZ: number): THREE.Mesh {
  const hx = Math.max(1, halfX - 0.6);
  const hz = Math.max(1, halfZ - 0.6);
  const y0 = -0.06;
  const y1 = -1.1;
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
      // Packed earth, not a pale concrete lip that reads white at range.
      colors[p] = 0.36;
      colors[p + 1] = 0.24;
      colors[p + 2] = 0.14;
      p += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "villa-skirt";
  mesh.castShadow = false;
  mesh.receiveShadow = shadows;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** A 12-triangle stand-in. Timber walls, rust roof — never a white box. */
function boxImpostor(halfX: number, halfZ: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(halfX * 2, WAREHOUSE_HEIGHT, halfZ * 2);
  geo.translate(0, WAREHOUSE_HEIGHT / 2, 0);
  const color = new Float32Array(geo.attributes.position.count * 3);
  const position = geo.attributes.position;
  const roofY = WAREHOUSE_HEIGHT * 0.72;
  for (let i = 0; i < position.count; i += 1) {
    const roof = position.getY(i) > roofY;
    color[i * 3] = roof ? 0.55 : 0.42;
    color[i * 3 + 1] = roof ? 0.26 : 0.24;
    color[i * 3 + 2] = roof ? 0.1 : 0.14;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "villa-impostor";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function prepareMaterial(mesh: THREE.Mesh, budget: QualityBudget, anisotropy: number): THREE.Texture[] {
  const textures: THREE.Texture[] = [];
  const source = mesh.material as THREE.Material | THREE.Material[];
  const first = Array.isArray(source) ? source[0] : source;
  const std = first as THREE.MeshStandardMaterial;
  const map = std?.map ?? null;
  const normalMap = std?.normalMap ?? null;
  if (budget.cheapPlants || !std?.isMeshStandardMaterial) {
    const lambert = new THREE.MeshLambertMaterial({
      map,
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    if (Array.isArray(source)) source.forEach((m) => m.dispose());
    else first?.dispose();
    mesh.material = lambert;
  } else {
    // Colour stays the texture's own. Metalness is the white-out: a Tripo
    // roughness map stores metal in blue, and metal under this sun clips.
    std.color.setHex(0xffffff);
    std.metalness = 0;
    std.metalnessMap = null;
    std.roughness = Math.max(std.roughness, 0.72);
    std.envMapIntensity = 0;
    std.side = THREE.DoubleSide;
  }
  if (map) {
    map.anisotropy = anisotropy;
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    textures.push(map);
  }
  if (normalMap && normalMap !== map) {
    normalMap.anisotropy = anisotropy;
    normalMap.wrapS = THREE.ClampToEdgeWrapping;
    normalMap.wrapT = THREE.ClampToEdgeWrapping;
    textures.push(normalMap);
  }
  return textures;
}

export function createWarehouse(budget: QualityBudget, anisotropy: number): Promise<Warehouse> {
  const shadows = budget.shadowMapSize > 0;
  return loadGltf(MODEL_URL).then((gltf) => {
    const group = new THREE.Group();
    group.name = "rusty-roof-villa";

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
      throw new Error("villa: model has no meshes");
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
    // Uniform. Stretching X or Z to force a 30 m cube would change the design.
    const scale = (WAREHOUSE_HEIGHT + BITE) / height;
    const midX = (box.min.x + box.max.x) / 2;
    const midZ = (box.min.z + box.max.z) / 2;
    const translateX = -midX * scale;
    const translateY = -BITE - box.min.y * scale;
    const translateZ = -midZ * scale;

    const shell: THREE.Object3D[] = [];
    const textures: THREE.Texture[] = [];

    for (const mesh of meshes) {
      mesh.geometry.scale(scale, scale, scale);
      mesh.geometry.translate(translateX, translateY, translateZ);
      mesh.geometry.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.castShadow = false;
      mesh.receiveShadow = shadows;
      mesh.frustumCulled = true;
      textures.push(...prepareMaterial(mesh, budget, anisotropy));
      group.add(mesh);
      shell.push(mesh);
    }

    const halfX = (size.x * scale) / 2;
    const halfZ = (size.z * scale) / 2;
    const far = boxImpostor(halfX, halfZ);
    group.add(far);

    let hull: THREE.Mesh | null = null;
    if (shadows) {
      hull = new THREE.Mesh(far.geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
      hull.name = "villa-shadow";
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

    let lod = 2;
    const apply = (next: number) => {
      if (next === lod) return;
      lod = next;
      const showShell = next < 2;
      for (let i = 0; i < shell.length; i += 1) shell[i].visible = showShell;
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
        if (next === 2 && d2 < FAR_IN) next = 0;
        else if (next === 0 && d2 > FAR_OUT) next = 2;
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
